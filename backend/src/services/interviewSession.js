export function createInterviewSessionRecord(
  prismaClient,
  clerkUserId,
  { selectedRole, technology, difficulty },
  questionSet,
) {
  return prismaClient.interviewSession.create({
    data: {
      clerkUserId,
      selectedRole,
      technology,
      difficulty,
      questionSource: questionSet.questionSource,
      answers: {
        create: questionSet.questions.map((question, questionIndex) => ({
          ...question,
          questionIndex,
        })),
      },
    },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
  });
}
