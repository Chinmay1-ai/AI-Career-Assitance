import { cppQuestions } from '../data/questionBank/cpp.js';
import { htmlCssQuestions } from '../data/questionBank/htmlcss.js';
import { javaQuestions } from '../data/questionBank/java.js';
import { javascriptQuestions } from '../data/questionBank/javascript.js';
import { mongoQuestions } from '../data/questionBank/mongodb.js';
import { nodejsQuestions } from '../data/questionBank/nodejs.js';
import { pythonQuestions } from '../data/questionBank/python.js';
import { reactQuestions } from '../data/questionBank/react.js';
import { springBootQuestions } from '../data/questionBank/springboot.js';
import { sqlQuestions } from '../data/questionBank/sql.js';

export const INTERVIEW_ROLES = [
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'Data Analyst',
  'DevOps Engineer',
  'Mobile Developer',
];

export const INTERVIEW_TECHNOLOGIES = [
  'Java',
  'Python',
  'JavaScript',
  'React',
  'Node.js',
  'SQL',
  'HTML & CSS',
  'C++',
  'MongoDB',
  'Spring Boot',
];

export const INTERVIEW_DIFFICULTIES = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
];

export const MAX_INTERVIEW_QUESTIONS = 10;
export const DEFAULT_INTERVIEW_QUESTIONS = 5;

export const QUESTION_BANK = {
  Java: javaQuestions,
  Python: pythonQuestions,
  JavaScript: javascriptQuestions,
  React: reactQuestions,
  'Node.js': nodejsQuestions,
  SQL: sqlQuestions,
  'HTML & CSS': htmlCssQuestions,
  'C++': cppQuestions,
  MongoDB: mongoQuestions,
  'Spring Boot': springBootQuestions,
};

export function normalizeInterviewTechnology(value) {
  if (typeof value !== 'string') return null;

  const trimmedTechnology = value.trim();
  if (/[\u0000-\u001f\u007f]/u.test(trimmedTechnology)) return null;
  const technology = trimmedTechnology.replace(/\s+/gu, ' ');
  if (
    technology.length < 1 ||
    technology.length > 80 ||
    !/^(?:[\p{L}\p{N}]|\.)(?:[\p{L}\p{N} .+#/&-]*)$/u.test(technology) ||
    !/[\p{L}\p{N}]/u.test(technology)
  ) {
    return null;
  }

  return INTERVIEW_TECHNOLOGIES.find(
    (item) => item.toLocaleLowerCase() === technology.toLocaleLowerCase(),
  ) ?? technology;
}

export function validateInterviewInput(input) {
  const errors = {};
  const selectedRole =
    typeof input?.selectedRole === 'string' ? input.selectedRole.trim() : '';
  const technology = normalizeInterviewTechnology(input?.technology);
  const difficulty =
    typeof input?.difficulty === 'string' ? input.difficulty.trim().toUpperCase() : '';
  const questionCount =
    input?.questionCount === undefined ? DEFAULT_INTERVIEW_QUESTIONS : input.questionCount;

  if (
    selectedRole.length < 2 ||
    selectedRole.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(selectedRole)
  ) {
    errors.selectedRole = 'Provide a role between 2 and 100 characters.';
  }
  if (!technology) {
    errors.technology = 'Enter a technology using 1 to 80 letters, numbers, spaces, or . # + / & - characters.';
  }
  if (!INTERVIEW_DIFFICULTIES.includes(difficulty)) {
    errors.difficulty = 'Choose Beginner, Intermediate, or Advanced difficulty.';
  }
  if (
    !Number.isInteger(questionCount) ||
    questionCount < 1 ||
    questionCount > MAX_INTERVIEW_QUESTIONS
  ) {
    errors.questionCount = `Question count must be an integer from 1 to ${MAX_INTERVIEW_QUESTIONS}.`;
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    value: { selectedRole, technology, difficulty, questionCount },
  };
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function selectInterviewQuestions(technology, count = DEFAULT_INTERVIEW_QUESTIONS) {
  const questions = QUESTION_BANK[technology];
  if (!questions) {
    throw new Error(`No interview question bank configured for ${technology}.`);
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_INTERVIEW_QUESTIONS) {
    throw new RangeError(`Question count must be from 1 to ${MAX_INTERVIEW_QUESTIONS}.`);
  }

  return shuffle(questions)
    .slice(0, Math.min(count, questions.length))
    .map(({ question, answer }) => ({
      questionText: question,
      referenceAnswer: answer,
    }));
}
