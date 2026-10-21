import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSpeechText } from './interviewerVoice.js';

test('speaks standalone vs as versus, case-insensitively', () => {
  assert.equal(
    normalizeSpeechText('Statement vs PreparedStatement'),
    'Statement versus PreparedStatement',
  );
  assert.equal(normalizeSpeechText('== vs equals()'), '== versus equals()');
  assert.equal(normalizeSpeechText('JDK vs. JRE'), 'JDK versus JRE');
});

test('does not replace vs when it is part of a larger word', () => {
  assert.equal(
    normalizeSpeechText('Review the reversed statement and VSCode tooling.'),
    'Review the reversed statement and VSCode tooling.',
  );
});
