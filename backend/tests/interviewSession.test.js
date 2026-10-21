import assert from 'node:assert/strict';
import test from 'node:test';
import { createInterviewSessionRecord } from '../src/services/interviewSession.js';

test('persists a custom technology and requested questions in the interview session', async () => {
  let createArguments;
  const session = await createInterviewSessionRecord({
    interviewSession: {
      create: async (args) => {
        createArguments = args;
        return { id: 'session-id', ...args.data };
      },
    },
  }, 'authenticated-user', {
    selectedRole: 'Platform Engineer',
    technology: 'Go',
    difficulty: 'ADVANCED',
  }, {
    questionSource: 'GEMINI',
    questions: [
      { questionText: 'How does Go manage concurrency?', referenceAnswer: 'Discuss goroutines and channels.' },
      { questionText: 'How do you profile Go services?', referenceAnswer: 'Use pprof and benchmarks.' },
    ],
  });

  assert.equal(createArguments.data.clerkUserId, 'authenticated-user');
  assert.equal(createArguments.data.selectedRole, 'Platform Engineer');
  assert.equal(createArguments.data.technology, 'Go');
  assert.equal(createArguments.data.difficulty, 'ADVANCED');
  assert.equal(createArguments.data.questionSource, 'GEMINI');
  assert.deepEqual(createArguments.data.answers.create.map(({ questionIndex }) => questionIndex), [0, 1]);
  assert.equal(session.id, 'session-id');
});
