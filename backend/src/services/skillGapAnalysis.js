import { SchemaType } from '@google/generative-ai';
import { generateGeminiJson } from './gemini.js';
import {
  CAREER_RECOMMENDATION_SCHEMA_VERSION,
  validateCareerRecommendations,
} from './careerRecommendations.js';
import { validateResumeAnalysis } from './resumeAnalysis.js';

export const SKILL_GAP_ANALYSIS_SCHEMA_VERSION = '1';

const importanceValues = ['High', 'Medium', 'Low'];
const stringSchema = (description) => ({ type: SchemaType.STRING, description });
const objectSchema = (properties) => ({
  type: SchemaType.OBJECT,
  properties,
  required: Object.keys(properties),
});

export const SKILL_GAP_ANALYSIS_SCHEMA = objectSchema({
  schemaVersion: {
    type: SchemaType.STRING,
    format: 'enum',
    enum: [SKILL_GAP_ANALYSIS_SCHEMA_VERSION],
    description: 'Version of this skill gap analysis contract.',
  },
  roleTitle: stringSchema('The exact title of the selected career recommendation.'),
  currentSkills: {
    type: SchemaType.ARRAY,
    items: stringSchema('A skill explicitly evidenced as matching this role.'),
    description: 'Skills listed as matching the selected career recommendation.',
  },
  skillGaps: {
    type: SchemaType.ARRAY,
    maxItems: 20,
    description: 'Skills listed as missing or weak in the selected recommendation.',
    items: objectSchema({
      skill: stringSchema('A skill from the selected recommendation missingOrWeakSkills.'),
      importance: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: importanceValues,
        description: 'Relative importance of the skill for this role.',
      },
      reason: stringSchema('A short reason grounded in the selected recommendation.'),
    }),
  },
  learningSuggestions: {
    type: SchemaType.ARRAY,
    maxItems: 20,
    description: 'Practical learning suggestions, one for each listed skill gap.',
    items: objectSchema({
      skill: stringSchema('The exact skill name of one listed skill gap.'),
      suggestion: stringSchema('A practical learning activity for this skill.'),
      priority: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: importanceValues,
        description: 'Priority matching the corresponding skill gap importance.',
      },
    }),
  },
});

const ALLOWED_PROVIDER_STATUSES = new Set([400, 401, 403, 404, 429, 500, 503]);

export class SkillGapAnalysisStageError extends Error {
  constructor(phase, classification, status = null) {
    super('Skill gap analysis generation failed.');
    this.name = 'SkillGapAnalysisStageError';
    this.phase = phase;
    this.classification = classification;
    this.status = status;
  }
}

function classifyProviderError(error) {
  const status =
    Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599
      ? error.status
      : null;
  return {
    status,
    classification: ALLOWED_PROVIDER_STATUSES.has(status) ? String(status) : 'unknown',
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value, keys, path) {
  if (
    !isRecord(value) ||
    keys.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error(`Invalid skill gap analysis at ${path}.`);
  }
}

function assertText(value, path, maxLength = 800) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid skill gap analysis at ${path}.`);
  }
}

function matchingName(value, values) {
  const normalized = value.trim().toLocaleLowerCase();
  return values.find((item) => item.trim().toLocaleLowerCase() === normalized);
}

export function validateSkillGapAnalysis(value, sourceAnalysis, recommendation) {
  validateResumeAnalysis(sourceAnalysis);
  validateCareerRecommendations(
    {
      schemaVersion: CAREER_RECOMMENDATION_SCHEMA_VERSION,
      recommendations: [recommendation],
    },
    sourceAnalysis,
  );

  assertRecord(
    value,
    ['schemaVersion', 'roleTitle', 'currentSkills', 'skillGaps', 'learningSuggestions'],
    'root',
  );
  if (value.schemaVersion !== SKILL_GAP_ANALYSIS_SCHEMA_VERSION) {
    throw new Error('Unsupported skill gap analysis version.');
  }
  assertText(value.roleTitle, 'roleTitle', 160);
  if (value.roleTitle !== recommendation.roleTitle) {
    throw new Error('Skill gap analysis role does not match the selected recommendation.');
  }

  const currentSkills = recommendation.matchingSkills;
  if (
    !Array.isArray(value.currentSkills) ||
    value.currentSkills.length !== currentSkills.length ||
    value.currentSkills.some((skill) =>
      typeof skill !== 'string' || !matchingName(skill, currentSkills),
    ) ||
    new Set(value.currentSkills.map((skill) => skill.trim().toLocaleLowerCase())).size !==
      currentSkills.length
  ) {
    throw new Error('Skill gap analysis contains unsupported current skills.');
  }

  const allowedGaps = recommendation.missingOrWeakSkills;
  if (!Array.isArray(value.skillGaps) || value.skillGaps.length > 20) {
    throw new Error('Invalid skill gap count.');
  }
  const seenGaps = new Set();
  value.skillGaps.forEach((gap, index) => {
    const path = `skillGaps[${index}]`;
    assertRecord(gap, ['skill', 'importance', 'reason'], path);
    assertText(gap.skill, `${path}.skill`, 160);
    const canonicalSkill = matchingName(gap.skill, allowedGaps);
    if (!canonicalSkill) throw new Error(`Unsupported skill gap at ${path}.`);
    const key = canonicalSkill.toLocaleLowerCase();
    if (seenGaps.has(key)) throw new Error('Duplicate skills in skill gap analysis.');
    seenGaps.add(key);
    if (!importanceValues.includes(gap.importance)) {
      throw new Error(`Invalid importance at ${path}.`);
    }
    assertText(gap.reason, `${path}.reason`, 800);
  });

  if (
    !Array.isArray(value.learningSuggestions) ||
    value.learningSuggestions.length !== value.skillGaps.length
  ) {
    throw new Error('Skill gap analysis requires one learning suggestion per gap.');
  }
  const seenSuggestions = new Set();
  value.learningSuggestions.forEach((item, index) => {
    const path = `learningSuggestions[${index}]`;
    assertRecord(item, ['skill', 'suggestion', 'priority'], path);
    assertText(item.skill, `${path}.skill`, 160);
    const gap = value.skillGaps.find(
      (candidate) => candidate.skill.toLocaleLowerCase() === item.skill.toLocaleLowerCase(),
    );
    if (!gap) throw new Error(`Learning suggestion has no matching skill gap at ${path}.`);
    const key = gap.skill.toLocaleLowerCase();
    if (seenSuggestions.has(key)) throw new Error('Duplicate learning suggestions.');
    seenSuggestions.add(key);
    assertText(item.suggestion, `${path}.suggestion`);
    if (!importanceValues.includes(item.priority) || item.priority !== gap.importance) {
      throw new Error(`Invalid priority at ${path}.`);
    }
  });

  return {
    schemaVersion: SKILL_GAP_ANALYSIS_SCHEMA_VERSION,
    roleTitle: recommendation.roleTitle,
    currentSkills,
    skillGaps: value.skillGaps.map((gap) => ({
      skill: matchingName(gap.skill, allowedGaps),
      importance: gap.importance,
      reason: 'The selected career recommendation identifies this as missing or weakly evidenced for the role.',
    })),
    learningSuggestions: value.learningSuggestions.map((item) => ({
      skill: matchingName(item.skill, allowedGaps),
      suggestion: item.suggestion.trim(),
      priority: item.priority,
    })),
  };
}

async function generateAnalysis(sourceAnalysis, recommendation) {
  const prompt = [
    'Create a skill gap analysis for only the selected role using the saved resume analysis and selected career recommendation below.',
    'Use only currentSkills that exactly match matchingSkills. Use only skill gaps that exactly match missingOrWeakSkills.',
    'Do not invent skills the person has. Do not claim the person lacks a skill; explain gaps only as the selected recommendation identifying a skill as missing or weakly evidenced.',
    'For every skill gap, provide one practical learning suggestion with priority equal to its importance. Do not introduce additional skills in suggestions.',
    'Return only JSON matching the supplied versioned schema.',
    '',
    '<saved_resume_analysis>',
    JSON.stringify(sourceAnalysis),
    '</saved_resume_analysis>',
    '<selected_career_recommendation>',
    JSON.stringify(recommendation),
    '</selected_career_recommendation>',
  ].join('\n');

  let responseText;
  try {
    responseText = await generateGeminiJson(prompt, SKILL_GAP_ANALYSIS_SCHEMA);
  } catch (error) {
    const { status, classification } = classifyProviderError(error);
    throw new SkillGapAnalysisStageError('gemini_provider', classification, status);
  }

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new SkillGapAnalysisStageError('response_parsing', 'invalid_json');
  }

  try {
    return validateSkillGapAnalysis(parsed, sourceAnalysis, recommendation);
  } catch {
    throw new SkillGapAnalysisStageError('skill_gap_validation', 'schema_invalid');
  }
}

export function generateSkillGapAnalysis(sourceAnalysis, recommendation) {
  return generateAnalysis(sourceAnalysis, recommendation);
}
