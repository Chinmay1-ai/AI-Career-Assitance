import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireClerkAuth } from '../middleware/requireClerkAuth.js';
import { handleResumeUploadError, resumeUpload } from '../middleware/resumeUpload.js';
import { isGeminiConfigured } from '../config/env.js';
import {
  extractResumeText,
  isAllowedResumeFile,
  textPreview,
} from '../services/resumeExtract.js';
import {
  analyzeResumeText,
  ResumeAnalysisStageError,
} from '../services/resumeAnalysis.js';
import {
  CAREER_RECOMMENDATION_SCHEMA_VERSION,
  CareerRecommendationStageError,
  generateCareerRecommendations,
  hashResumeAnalysis,
  validateCareerRecommendations,
} from '../services/careerRecommendations.js';
import {
  generateSkillGapAnalysis,
  SKILL_GAP_ANALYSIS_SCHEMA_VERSION,
  SkillGapAnalysisStageError,
  validateSkillGapAnalysis,
} from '../services/skillGapAnalysis.js';

const router = Router();
router.use(requireClerkAuth);

function toResumeResponse(resume) {
  let careerRecommendationsCurrent = false;
  if (resume.analysisJson && resume.careerRecommendationsJson) {
    try {
      careerRecommendationsCurrent =
        resume.careerRecommendationsJson.schemaVersion === CAREER_RECOMMENDATION_SCHEMA_VERSION &&
        resume.careerRecommendationsAnalysisHash === hashResumeAnalysis(resume.analysisJson);
    } catch {
      careerRecommendationsCurrent = false;
    }
  }

  return {
    id: resume.id,
    clerkUserId: resume.clerkUserId,
    originalFilename: resume.originalFilename,
    mimeType: resume.mimeType,
    fileSize: resume.fileSize,
    characterCount: resume.extractedText.length,
    textPreview: textPreview(resume.extractedText),
    analysisJson: resume.analysisJson,
    careerRecommendationsJson: resume.careerRecommendationsJson,
    skillGapAnalysisJson: resume.skillGapAnalysisJson,
    careerRecommendationsCurrent,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

router.post('/', resumeUpload, handleResumeUploadError, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Please choose a PDF or DOCX file.' });
    return;
  }

  if (!isAllowedResumeFile(req.file)) {
    res.status(400).json({ error: 'Only PDF and DOCX files are allowed.' });
    return;
  }

  try {
    const extractedText = await extractResumeText(req.file);
    const resume = await prisma.resume.create({
      data: {
        clerkUserId: req.auth.userId,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        fileSize: req.file.size,
        extractedText,
      },
    });

    res.status(201).json(toResumeResponse(resume));
  } catch (error) {
    console.error('Resume upload failed:', error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Could not process this resume.';
    const clientError =
      message.includes('Only PDF') ||
      message.includes('Could not extract') ||
      message.includes('supported');
    res.status(clientError ? 400 : 500).json({ error: message });
  }
});

router.post('/:resumeId/analyze', async (req, res) => {
  let resume;
  try {
    resume = await prisma.resume.findFirst({
      where: {
        id: req.params.resumeId,
        clerkUserId: req.auth.userId,
      },
    });
  } catch {
    console.error('Resume analysis diagnostic:', {
      phase: 'database_lookup',
      classification: 'unknown',
      status: null,
    });
    res.status(500).json({ error: 'Could not load this resume for analysis.' });
    return;
  }

  if (!resume) {
    res.status(404).json({ error: 'Resume not found.' });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: 'Resume analysis is not configured.' });
    return;
  }

  let analysis;
  try {
    analysis = await analyzeResumeText(resume.extractedText);
  } catch (error) {
    const phase = error instanceof ResumeAnalysisStageError
      ? error.phase
      : 'resume_analysis';
    const classification = error instanceof ResumeAnalysisStageError
      ? error.classification
      : 'unknown';
    const status = error instanceof ResumeAnalysisStageError ? error.status : null;
    console.error('Resume analysis diagnostic:', { phase, classification, status });
    res.status(502).json({ error: 'Could not generate a valid resume analysis. Please try again.' });
    return;
  }

  try {
    const savedResume = await prisma.resume.update({
      where: { id: resume.id },
      data: { analysisJson: analysis, skillGapAnalysisJson: null },
      select: { analysisJson: true, updatedAt: true },
    });
    res.json({
      resumeId: resume.id,
      analysis: savedResume.analysisJson,
      updatedAt: savedResume.updatedAt,
    });
  } catch {
    console.error('Resume analysis diagnostic:', {
      phase: 'database_persistence',
      classification: 'unknown',
      status: null,
    });
    res.status(500).json({ error: 'Could not save the resume analysis.' });
  }
});

router.post('/:resumeId/recommendations', async (req, res) => {
  let resume;
  try {
    resume = await prisma.resume.findFirst({
      where: {
        id: req.params.resumeId,
        clerkUserId: req.auth.userId,
      },
      select: {
        id: true,
        analysisJson: true,
        careerRecommendationsJson: true,
        careerRecommendationsAnalysisHash: true,
        updatedAt: true,
      },
    });
  } catch {
    console.error('Career recommendation lookup failed.');
    res.status(500).json({ error: 'Could not load this resume for recommendations.' });
    return;
  }

  if (!resume) {
    res.status(404).json({ error: 'Resume not found.' });
    return;
  }
  if (!resume.analysisJson) {
    res.status(409).json({ error: 'Analyze this resume before generating recommendations.' });
    return;
  }

  let analysisHash;
  try {
    analysisHash = hashResumeAnalysis(resume.analysisJson);
  } catch {
    res.status(409).json({ error: 'The saved resume analysis is invalid. Analyze the resume again.' });
    return;
  }

  if (
    resume.careerRecommendationsAnalysisHash === analysisHash &&
    resume.careerRecommendationsJson?.schemaVersion === CAREER_RECOMMENDATION_SCHEMA_VERSION
  ) {
    try {
      const recommendations = validateCareerRecommendations(
        resume.careerRecommendationsJson,
        resume.analysisJson,
      );
      res.json({ resumeId: resume.id, recommendations, cached: true });
      return;
    } catch {
      // Invalid cached data is regenerated instead of being returned.
    }
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: 'Career recommendations are not configured.' });
    return;
  }

  let recommendations;
  try {
    recommendations = await generateCareerRecommendations(resume.analysisJson, analysisHash);
  } catch (error) {
    const phase = error instanceof CareerRecommendationStageError
      ? error.phase
      : 'recommendation_generation';
    const classification = error instanceof CareerRecommendationStageError
      ? error.classification
      : 'unclassified_error';
    const status = error instanceof CareerRecommendationStageError ? error.status : null;
    console.error('Career recommendation diagnostic:', { phase, classification, status });
    res.status(502).json({ error: 'Could not generate valid career recommendations. Please try again.' });
    return;
  }

  try {
    const latestResume = await prisma.resume.findFirst({
      where: { id: resume.id, clerkUserId: req.auth.userId },
      select: { analysisJson: true },
    });
    if (!latestResume) {
      res.status(404).json({ error: 'Resume not found.' });
      return;
    }
    let latestAnalysisHash;
    try {
      latestAnalysisHash = hashResumeAnalysis(latestResume.analysisJson);
    } catch {
      res.status(409).json({ error: 'Resume analysis changed. Please retry recommendations.' });
      return;
    }
    if (latestAnalysisHash !== analysisHash) {
      res.status(409).json({ error: 'Resume analysis changed. Please retry recommendations.' });
      return;
    }

    const saved = await prisma.resume.updateMany({
      where: {
        id: resume.id,
        clerkUserId: req.auth.userId,
        updatedAt: resume.updatedAt,
      },
      data: {
        careerRecommendationsJson: recommendations,
        careerRecommendationsAnalysisHash: analysisHash,
        skillGapAnalysisJson: null,
      },
    });
    if (saved.count !== 1) {
      res.status(409).json({ error: 'Resume changed while recommendations were generated. Please retry.' });
      return;
    }
    res.json({ resumeId: resume.id, recommendations, cached: false });
  } catch {
    console.error('Career recommendation diagnostic:', {
      phase: 'database_persistence',
      classification: 'database_error',
    });
    res.status(500).json({ error: 'Could not save career recommendations.' });
  }
});

router.post('/:resumeId/skill-gaps', async (req, res) => {
  let resume;
  try {
    resume = await prisma.resume.findFirst({
      where: {
        id: req.params.resumeId,
        clerkUserId: req.auth.userId,
      },
      select: {
        id: true,
        analysisJson: true,
        careerRecommendationsJson: true,
        careerRecommendationsAnalysisHash: true,
        skillGapAnalysisJson: true,
        updatedAt: true,
      },
    });
  } catch {
    console.error('Skill gap analysis lookup failed.');
    res.status(500).json({ error: 'Could not load this resume for skill gap analysis.' });
    return;
  }

  if (!resume) {
    res.status(404).json({ error: 'Resume not found.' });
    return;
  }
  if (!resume.analysisJson || !resume.careerRecommendationsJson) {
    res.status(409).json({ error: 'Analyze this resume and generate career recommendations first.' });
    return;
  }

  let analysisHash;
  let recommendations;
  try {
    analysisHash = hashResumeAnalysis(resume.analysisJson);
    if (resume.careerRecommendationsAnalysisHash !== analysisHash) {
      res.status(409).json({ error: 'Refresh career recommendations for the current resume analysis first.' });
      return;
    }
    recommendations = validateCareerRecommendations(
      resume.careerRecommendationsJson,
      resume.analysisJson,
    ).recommendations;
  } catch {
    res.status(409).json({ error: 'The saved resume analysis or recommendations are invalid. Refresh them first.' });
    return;
  }

  const requestedRoleTitle = req.body?.roleTitle;
  if (typeof requestedRoleTitle !== 'string' || !requestedRoleTitle.trim()) {
    res.status(400).json({ error: 'Select a recommended role for skill gap analysis.' });
    return;
  }
  const recommendation = recommendations.find(
    (item) => item.roleTitle === requestedRoleTitle.trim(),
  );
  if (!recommendation) {
    res.status(400).json({ error: 'Select a role from the saved career recommendations.' });
    return;
  }

  if (
    resume.skillGapAnalysisJson?.schemaVersion === SKILL_GAP_ANALYSIS_SCHEMA_VERSION &&
    resume.skillGapAnalysisJson.roleTitle === recommendation.roleTitle
  ) {
    try {
      const skillGapAnalysis = validateSkillGapAnalysis(
        resume.skillGapAnalysisJson,
        resume.analysisJson,
        recommendation,
      );
      res.json({ resumeId: resume.id, skillGapAnalysis, cached: true });
      return;
    } catch {
      // Invalid cached data is regenerated instead of being returned.
    }
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({
      code: 'AI_TEMPORARILY_UNAVAILABLE',
      error: 'Skill gap analysis is temporarily unavailable. Please try again later.',
    });
    return;
  }

  let skillGapAnalysis;
  try {
    skillGapAnalysis = await generateSkillGapAnalysis(resume.analysisJson, recommendation);
  } catch (error) {
    const phase = error instanceof SkillGapAnalysisStageError
      ? error.phase
      : 'skill_gap_generation';
    const classification = error instanceof SkillGapAnalysisStageError
      ? error.classification
      : 'unclassified_error';
    const status = error instanceof SkillGapAnalysisStageError ? error.status : null;
    console.error('Skill gap analysis diagnostic:', { phase, classification, status });
    if (status === 503) {
      res.status(503).json({
        code: 'AI_TEMPORARILY_UNAVAILABLE',
        error: 'Skill gap analysis is temporarily unavailable. Please try again later.',
      });
      return;
    }
    res.status(502).json({ error: 'Could not generate a valid skill gap analysis. Please try again.' });
    return;
  }

  try {
    const saved = await prisma.resume.updateMany({
      where: {
        id: resume.id,
        clerkUserId: req.auth.userId,
        updatedAt: resume.updatedAt,
      },
      data: { skillGapAnalysisJson },
    });
    if (saved.count !== 1) {
      res.status(409).json({ error: 'Resume changed while skill gaps were generated. Please retry.' });
      return;
    }
    res.json({ resumeId: resume.id, skillGapAnalysis, cached: false });
  } catch {
    console.error('Skill gap analysis persistence failed.');
    res.status(500).json({ error: 'Could not save the skill gap analysis.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const resumes = await prisma.resume.findMany({
      where: { clerkUserId: req.auth.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ resumes: resumes.map(toResumeResponse) });
  } catch (error) {
    console.error('Resume list failed:', error);
    res.status(500).json({ error: 'Could not load resumes.' });
  }
});

export default router;
