import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInterviewResumeContext,
  createInterviewQuestionSet,
  generateInterviewQuestions,
  getOwnedInterviewResumeContext,
  InterviewQuestionGenerationError,
  validateGeneratedInterviewQuestions,
} from '../src/services/interviewQuestionGeneration.js';
import { hashResumeAnalysis } from '../src/services/careerRecommendations.js';

const input = {
  selectedRole: 'Backend Developer',
  technology: 'Node.js',
  difficulty: 'ADVANCED',
  questionCount: 2,
};

function response(questions) {
  return { schemaVersion: '1', questions };
}

function questions() {
  return [
    {
      questionText: 'How would you diagnose event-loop latency in a Node.js service?',
      referenceAnswer: 'Measure event-loop delay, inspect blocking work, and profile the hot path.',
    },
    {
      questionText: 'What trade-offs would guide your API service architecture?',
      referenceAnswer: 'Discuss workload, reliability, observability, coupling, and operating costs.',
    },
  ];
}

function sampleAnalysis() {
  return {
    schemaVersion: '1',
    candidate: {
      fullName: 'Example Candidate',
      email: 'candidate@example.test',
      phone: null,
      location: null,
      headline: null,
      links: { linkedin: null, github: null, portfolio: null },
    },
    professionalSummary: null,
    education: [],
    skills: {
      programmingLanguages: ['JavaScript'],
      frameworksLibraries: ['Node.js'],
      databases: [],
      toolsTechnologies: [],
      other: [],
    },
    projects: [{
      name: 'API project',
      description: 'Built a small API.',
      role: 'Developer',
      technologies: ['Node.js'],
      url: null,
    }],
    experience: [],
    certifications: [],
    achievements: [],
    additionalSections: [],
  };
}

test('accepts a valid Gemini response and supplies difficulty, role, and count', async () => {
  let capturedPrompt;
  let capturedSchema;
  const generated = await generateInterviewQuestions(input, null, {
    generateJson: async (prompt, schema) => {
      capturedPrompt = prompt;
      capturedSchema = schema;
      return JSON.stringify(response(questions()));
    },
  });

  assert.equal(generated.length, 2);
  assert.match(capturedPrompt, /Backend Developer/);
  assert.match(capturedPrompt, /Node\.js/);
  assert.match(capturedPrompt, /deeper internals, architecture, trade-offs/);
  assert.equal(capturedSchema.properties.questions.maxItems, 2);
});

test('rejects duplicate questions and wrong question counts', () => {
  const duplicate = questions();
  duplicate[1].questionText = ` ${duplicate[0].questionText.toLocaleUpperCase()} `;
  assert.throws(
    () => validateGeneratedInterviewQuestions(response(duplicate), input),
    /duplicates/,
  );
  assert.throws(
    () => validateGeneratedInterviewQuestions(response(questions().slice(0, 1)), input),
    /count/,
  );
  assert.throws(
    () => validateGeneratedInterviewQuestions({
      ...response(questions()),
      unexpected: true,
    }, input),
    /Invalid interview questions/,
  );
  assert.throws(
    () => validateGeneratedInterviewQuestions(response([
      { ...questions()[0], unexpected: true },
      questions()[1],
    ]), input),
    /Invalid interview questions/,
  );
});

test('classifies malformed JSON and provider errors for safe fallback', async () => {
  await assert.rejects(
    generateInterviewQuestions(input, null, {
      generateJson: async () => '{malformed',
    }),
    (error) => error instanceof InterviewQuestionGenerationError &&
      error.phase === 'response_parsing',
  );
  await assert.rejects(
    generateInterviewQuestions(input, null, {
      generateJson: async () => {
        const error = new Error('provider unavailable');
        error.status = 503;
        throw error;
      },
    }),
    (error) => error instanceof InterviewQuestionGenerationError &&
      error.status === 503,
  );
  await assert.rejects(
    generateInterviewQuestions(input, null, {
      generateJson: () => new Promise(() => {}),
      timeoutMs: 5,
    }),
    (error) => error instanceof InterviewQuestionGenerationError &&
      error.classification === 'timeout',
  );
});

test('uses local questions when Gemini is unconfigured or generation fails', async () => {
  const localQuestions = questions();
  const selectLocal = () => localQuestions;
  const unconfigured = await createInterviewQuestionSet(input, null, {
    configured: false,
    selectLocal,
  });
  assert.equal(unconfigured.questionSource, 'LOCAL_FALLBACK');
  assert.equal(unconfigured.questions, localQuestions);

  const failed = await createInterviewQuestionSet(input, null, {
    configured: true,
    generate: async () => {
      throw new InterviewQuestionGenerationError('gemini_provider', '503', 503);
    },
    selectLocal,
  });
  assert.equal(failed.questionSource, 'LOCAL_FALLBACK');
  assert.equal(failed.diagnostic.status, 503);

  const invalidJsonFallback = await createInterviewQuestionSet(input, null, {
    configured: true,
    generate: (request, context) => generateInterviewQuestions(request, context, {
      generateJson: async () => '{malformed',
    }),
    selectLocal,
  });
  assert.equal(invalidJsonFallback.questionSource, 'LOCAL_FALLBACK');
  assert.equal(invalidJsonFallback.diagnostic.classification, 'invalid_json');
});

test('generates custom-technology questions with role, difficulty, and requested count', async () => {
  const customInput = {
    selectedRole: 'Platform Engineer',
    technology: 'Go',
    difficulty: 'ADVANCED',
    questionCount: 2,
  };
  let capturedPrompt;
  const customQuestions = await createInterviewQuestionSet(customInput, null, {
    configured: true,
    generate: (request, context) => generateInterviewQuestions(request, context, {
      generateJson: async (prompt) => {
        capturedPrompt = prompt;
        return JSON.stringify(response([
          {
            questionText: 'How do goroutines coordinate through channels?',
            referenceAnswer: 'Goroutines communicate through typed channels, with synchronization determined by channel operations.',
          },
          {
            questionText: 'How would you profile a Go service under load?',
            referenceAnswer: 'Use Go profiling and benchmarking tools to identify CPU, memory, and blocking bottlenecks.',
          },
        ]));
      },
    }),
  });

  assert.match(capturedPrompt, /Role: Platform Engineer/);
  assert.match(capturedPrompt, /Technology: Go/);
  assert.match(capturedPrompt, /Difficulty: ADVANCED/);
  assert.match(capturedPrompt, /Question count: exactly 2/);
  assert.equal(customQuestions.questionSource, 'GEMINI');
  assert.equal(customQuestions.questions.length, 2);
});

test('does not substitute unrelated local questions for unsupported custom technology', async () => {
  const customInput = { ...input, technology: 'Rust' };
  let generationCalls = 0;

  await assert.rejects(
    createInterviewQuestionSet(customInput, null, {
      configured: false,
      selectLocal: () => {
        throw new Error('must not select unrelated questions');
      },
    }),
    (error) => error.code === 'CUSTOM_TECHNOLOGY_QUESTIONS_UNAVAILABLE' &&
      error.status === 503 &&
      /AI question generation is temporarily unavailable/.test(error.message) &&
      /choose an available local-bank technology/.test(error.message),
  );

  await assert.rejects(
    createInterviewQuestionSet(customInput, null, {
      configured: true,
      generate: async () => {
        generationCalls += 1;
        throw new InterviewQuestionGenerationError('gemini_provider', '503', 503);
      },
    }),
    (error) => error.code === 'CUSTOM_TECHNOLOGY_QUESTIONS_UNAVAILABLE' &&
      error.status === 503,
  );
  assert.equal(generationCalls, 1);
});

test('rejects local-only mode for custom technologies without a question bank', async () => {
  await assert.rejects(
    createInterviewQuestionSet({ ...input, technology: 'Kubernetes' }, null, {
      mode: 'LOCAL',
    }),
    (error) => error.code === 'CUSTOM_TECHNOLOGY_QUESTIONS_UNAVAILABLE' &&
      /Choose AI-generated questions and retry/.test(error.message),
  );
});

test('supports intentional local mode and AI generation without resume context', async () => {
  let generationCalls = 0;
  let receivedContext = 'unset';
  const local = await createInterviewQuestionSet(input, null, {
    mode: 'LOCAL',
    selectLocal: () => questions(),
    generate: async () => {
      generationCalls += 1;
      return questions();
    },
  });
  assert.equal(local.questionSource, 'LOCAL');
  assert.equal(generationCalls, 0);

  const generated = await createInterviewQuestionSet(input, null, {
    configured: true,
    generate: async (_request, context) => {
      generationCalls += 1;
      receivedContext = context;
      return questions();
    },
  });
  assert.equal(generated.questionSource, 'GEMINI');
  assert.equal(receivedContext, null);
});

test('uses validated resume context while excluding personal contact details', async () => {
  const analysis = sampleAnalysis();
  const resume = {
    analysisJson: analysis,
    careerRecommendationsJson: {
      schemaVersion: '1',
      recommendations: [{
        roleTitle: 'Backend Developer',
        matchPercentage: 80,
        reason: 'JavaScript and Node.js are evidenced in the saved resume analysis.',
        matchingSkills: ['Node.js'],
        missingOrWeakSkills: ['Distributed systems'],
        nextSkills: ['Distributed systems'],
      }],
    },
    careerRecommendationsAnalysisHash: hashResumeAnalysis(analysis),
    skillGapAnalysisJson: null,
  };
  const context = buildInterviewResumeContext(resume, 'Backend Developer');

  assert.ok(context);
  assert.ok(context.skills.includes('Node.js'));
  assert.equal(context.selectedRoleRecommendation.roleTitle, 'Backend Developer');
  assert.equal(JSON.stringify(context).includes('candidate@example.test'), false);
  assert.equal(JSON.stringify(context).includes('Example Candidate'), false);

  let capturedPrompt;
  await generateInterviewQuestions(input, context, {
    generateJson: async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify(response(questions()));
    },
  });
  assert.match(capturedPrompt, /API project/);
  assert.equal(capturedPrompt.includes('candidate@example.test'), false);
});

test('looks up resume context using both resume ID and authenticated user ID', async () => {
  let query;
  const result = await getOwnedInterviewResumeContext({
    resume: {
      findFirst: async (args) => {
        query = args;
        return null;
      },
    },
  }, 'resume-owned-by-another-user', 'authenticated-user', input.selectedRole);

  assert.deepEqual(query.where, {
    id: 'resume-owned-by-another-user',
    clerkUserId: 'authenticated-user',
  });
  assert.equal(result.found, false);
});
