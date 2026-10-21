import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTechnologySelection,
  validateTechnologyName,
} from './interviewSetup.js';

const technologies = ['Java', 'Python', 'Node.js'];

test('resolves a predefined technology selection', () => {
  assert.deepEqual(resolveTechnologySelection({
    popularTechnology: 'Python',
    customTechnology: '',
    technologies,
  }), { value: 'Python', error: '' });
});

test('custom technology takes precedence and trims repeated whitespace', () => {
  assert.deepEqual(resolveTechnologySelection({
    popularTechnology: 'Java',
    customTechnology: '  Apache   Kafka  ',
    technologies,
  }), { value: 'Apache Kafka', error: '' });
});

test('canonicalizes custom input matching an existing popular technology', () => {
  assert.deepEqual(resolveTechnologySelection({
    popularTechnology: '',
    customTechnology: ' node.js ',
    technologies,
  }), { value: 'Node.js', error: '' });
});

test('rejects empty, whitespace-only, excessive, and invalid technology input', () => {
  assert.ok(validateTechnologyName('').error);
  assert.ok(validateTechnologyName('   ').error);
  assert.ok(validateTechnologyName('K'.repeat(81)).error);
  assert.ok(validateTechnologyName('Go<script>').error);
  assert.ok(validateTechnologyName('Go\nRust').error);
  assert.deepEqual(validateTechnologyName('  AI / ML  '), {
    value: 'AI / ML',
    error: '',
  });
});
