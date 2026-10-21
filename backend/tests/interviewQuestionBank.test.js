import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERVIEW_TECHNOLOGIES,
  normalizeInterviewTechnology,
  validateInterviewInput,
} from '../src/services/interviewQuestionBank.js';

test('keeps predefined technology choices and canonicalizes casing', () => {
  assert.ok(INTERVIEW_TECHNOLOGIES.includes('Python'));
  assert.equal(normalizeInterviewTechnology(' python '), 'Python');
  assert.deepEqual(validateInterviewInput({
    selectedRole: 'Backend Developer',
    technology: ' Node.js ',
    difficulty: 'advanced',
    questionCount: 3,
  }).value, {
    selectedRole: 'Backend Developer',
    technology: 'Node.js',
    difficulty: 'ADVANCED',
    questionCount: 3,
  });
});

test('accepts trimmed custom technologies and preserves interview settings', () => {
  const validation = validateInterviewInput({
    selectedRole: ' Data Engineer ',
    technology: '  Apache   Kafka ',
    difficulty: 'INTERMEDIATE',
    questionCount: 7,
  });

  assert.deepEqual(validation.value, {
    selectedRole: 'Data Engineer',
    technology: 'Apache Kafka',
    difficulty: 'INTERMEDIATE',
    questionCount: 7,
  });
});

test('rejects empty, oversized, and invalid technology input', () => {
  for (const technology of ['', '   ', 'x'.repeat(81), 'Go<script>']) {
    const validation = validateInterviewInput({
      selectedRole: 'Backend Developer',
      technology,
      difficulty: 'BEGINNER',
      questionCount: 5,
    });
    assert.ok(validation.errors.technology, `expected "${technology}" to be rejected`);
  }
});
