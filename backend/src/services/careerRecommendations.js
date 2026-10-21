import { createHash } from 'node:crypto';
import { SchemaType } from '@google/generative-ai';
import { generateGeminiJson } from './gemini.js';
import { validateResumeAnalysis } from './resumeAnalysis.js';

export const CAREER_RECOMMENDATION_SCHEMA_VERSION = '1';

const stringSchema = (description) => ({ type: SchemaType.STRING, description });
const stringArraySchema = (description) => ({
  type: SchemaType.ARRAY,
  items: stringSchema(''),
  description,
});
const objectSchema = (properties) => ({
  type: SchemaType.OBJECT,
  properties,
  required: Object.keys(properties),
});

export const CAREER_RECOMMENDATION_SCHEMA = objectSchema({
  schemaVersion: {
    type: SchemaType.STRING,
    format: 'enum',
    enum: [CAREER_RECOMMENDATION_SCHEMA_VERSION],
    description: 'Version of this recommendation contract.',
  },
  recommendations: {
    type: SchemaType.ARRAY,
    maxItems: 5,
    description: 'Zero to five ranked recommendations supported by the saved analysis.',
    items: objectSchema({
      roleTitle: stringSchema('Specific career role title.'),
      matchPercentage: {
        type: SchemaType.INTEGER,
        description: 'Evidence-based estimated match from 0 through 100.',
      },
      reason: stringSchema('Short explanation grounded in the supplied resume analysis.'),
      matchingSkills: stringArraySchema('Skills or qualifications evidenced in the analysis.'),
      missingOrWeakSkills: stringArraySchema(
        'Genuine role-relevant skills not present or weakly evidenced in the analysis.',
      ),
      nextSkills: stringArraySchema('Practical skills to improve suitability for this role.'),
    }),
  },
});

const inFlightRecommendations = new Map();
const ALLOWED_PROVIDER_STATUSES = new Set([400, 401, 403, 404, 429, 500, 503]);

export class CareerRecommendationStageError extends Error {
  constructor(phase, classification, status = null) {
    super('Career recommendation generation failed.');
    this.name = 'CareerRecommendationStageError';
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
  const classification = ALLOWED_PROVIDER_STATUSES.has(status)
    ? String(status)
    : 'unknown';
  return { status, classification };
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
    throw new Error(`Invalid career recommendations at ${path}.`);
  }
}

function assertString(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid career recommendations at ${path}.`);
  }
}

function assertStringArray(value, path) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(`Invalid career recommendations at ${path}.`);
  }
}

function collectAnalysisText(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectAnalysisText(item, output));
  } else if (isRecord(value)) {
    Object.values(value).forEach((item) => collectAnalysisText(item, output));
  }
  return output;
}

function hasAnalysisEvidence(phrase, evidenceText) {
  const escapedPhrase = phrase
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapedPhrase}($|[^\\p{L}\\p{N}])`,
    'iu',
  );
  return evidenceText.some((text) => pattern.test(text));
}

export function validateCareerRecommendations(value, sourceAnalysis) {
  validateResumeAnalysis(sourceAnalysis);
  assertRecord(value, ['schemaVersion', 'recommendations'], 'root');
  assertString(value.schemaVersion, 'schemaVersion');
  if (value.schemaVersion !== CAREER_RECOMMENDATION_SCHEMA_VERSION) {
    throw new Error('Unsupported career recommendation version.');
  }
  if (
    !Array.isArray(value.recommendations) ||
    value.recommendations.length > 5
  ) {
    throw new Error('Invalid career recommendation count.');
  }

  const roles = new Set();
  const evidenceText = collectAnalysisText(sourceAnalysis);
  value.recommendations.forEach((recommendation, index) => {
    const path = `recommendations[${index}]`;
    assertRecord(
      recommendation,
      [
        'roleTitle',
        'matchPercentage',
        'reason',
        'matchingSkills',
        'missingOrWeakSkills',
        'nextSkills',
      ],
      path,
    );
    assertString(recommendation.roleTitle, `${path}.roleTitle`);
    const roleKey = recommendation.roleTitle.trim().toLocaleLowerCase();
    if (roles.has(roleKey)) throw new Error('Duplicate career recommendation roles.');
    roles.add(roleKey);
    if (
      !Number.isInteger(recommendation.matchPercentage) ||
      recommendation.matchPercentage < 0 ||
      recommendation.matchPercentage > 100
    ) {
      throw new Error(`Invalid career recommendations at ${path}.matchPercentage.`);
    }
    assertString(recommendation.reason, `${path}.reason`);
    assertStringArray(recommendation.matchingSkills, `${path}.matchingSkills`);
    if (recommendation.matchingSkills.some((skill) => !hasAnalysisEvidence(skill, evidenceText))) {
      throw new Error(`Unsupported matching skill at ${path}.matchingSkills.`);
    }
    assertStringArray(recommendation.missingOrWeakSkills, `${path}.missingOrWeakSkills`);
    assertStringArray(recommendation.nextSkills, `${path}.nextSkills`);
  });

  return value;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashResumeAnalysis(analysis) {
  validateResumeAnalysis(analysis);
  return createHash('sha256').update(stableStringify(analysis)).digest('hex');
}

async function generateRecommendations(analysis) {
  const prompt = [
    'Recommend the most suitable career roles using only the saved structured resume analysis below.',
    'Do not invent or claim skills, experience, projects, certifications, education, or qualifications not present in the analysis.',
    'matchingSkills must use skill wording present in the analysis. missingOrWeakSkills must be genuine gaps against the requirements of the recommended role, not arbitrary omissions.',
    'nextSkills should be practical, specific skills that would improve suitability for that role.',
    'Return at most five distinct roles, ranked from strongest fit to weakest. Prefer three to five only when the evidence supports them; return fewer rather than recommending unsuitable roles.',
    'The integer match percentage is an evidence-based estimate from demonstrated skills, projects, experience, education, and certifications. It is not random; calibrate it conservatively and consistently with the reason and matching skills.',
    'Do not send or request raw resume text. Return only the JSON object matching the supplied schema.',
    '',
    '<saved_resume_analysis>',
    JSON.stringify(analysis),
    '</saved_resume_analysis>',
  ].join('\n');

  let responseText;
  try {
    responseText = await generateGeminiJson(prompt, CAREER_RECOMMENDATION_SCHEMA);
  } catch (error) {
    const { status, classification } = classifyProviderError(error);
    throw new CareerRecommendationStageError('gemini_provider', classification, status);
  }

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new CareerRecommendationStageError('response_parsing', 'invalid_json');
  }

  try {
    return validateCareerRecommendations(parsed, analysis);
  } catch {
    throw new CareerRecommendationStageError('recommendation_validation', 'schema_invalid');
  }
}

export function generateCareerRecommendations(analysis, analysisHash) {
  const cacheKey = `${CAREER_RECOMMENDATION_SCHEMA_VERSION}:${analysisHash}`;
  const existingRequest = inFlightRecommendations.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = generateRecommendations(analysis).finally(() => {
    if (inFlightRecommendations.get(cacheKey) === request) {
      inFlightRecommendations.delete(cacheKey);
    }
  });
  inFlightRecommendations.set(cacheKey, request);
  return request;
}