import { z } from 'zod';
import { forbidden, notFound } from '../errors.mjs';

const trainerContext = z.object({ trainerId: z.string().uuid() }).strict();
const id = z.string().uuid();
const homeworkPatch = z.object({ why: z.string().trim().min(1).max(1000) }).strict();
const childName = z.string().trim().min(1).max(100);
const noteText = z.string().trim().min(1).max(2000);

export function createHomeworkService(homeworks, members) {
  const actor = context => trainerContext.parse(context);
  const owned = async result => {
    const value = await result;
    if (!value) throw notFound();
    return value;
  };

  return {
    async get(context, homeworkId) {
      const contextValue = actor(context);
      return owned(homeworks.findOwnedById(contextValue.trainerId, id.parse(homeworkId)));
    },

    async update(context, homeworkId, input) {
      const contextValue = actor(context);
      const patch = homeworkPatch.parse(input);
      return owned(homeworks.updateOwnedWhy(contextValue.trainerId, id.parse(homeworkId), patch.why));
    },

    async remove(context, homeworkId) {
      await this.get(context, homeworkId);
      throw forbidden();
    },

    async assertCanCreate(context, memberId) {
      const contextValue = actor(context);
      await owned(members.findOwnedById(contextValue.trainerId, id.parse(memberId)));
      return { trainerId: contextValue.trainerId, memberId };
    },

    async getExercise(context, exerciseId) {
      const contextValue = actor(context);
      return owned(homeworks.findExerciseOwnedById(contextValue.trainerId, id.parse(exerciseId)));
    },

    async updateExercise(context, exerciseId, name) {
      const contextValue = actor(context);
      return owned(homeworks.updateExerciseOwnedName(contextValue.trainerId, id.parse(exerciseId), childName.parse(name)));
    },

    async getSubmission(context, submissionId) {
      const contextValue = actor(context);
      return owned(homeworks.findSubmissionOwnedById(contextValue.trainerId, id.parse(submissionId)));
    },

    async getFeedback(context, submissionId) {
      const contextValue = actor(context);
      return owned(homeworks.findFeedbackOwnedById(contextValue.trainerId, id.parse(submissionId)));
    },

    async getSessionNote(context, noteId) {
      const contextValue = actor(context);
      return owned(homeworks.findSessionNoteOwnedById(contextValue.trainerId, id.parse(noteId)));
    },

    async updateSessionNote(context, noteId, note) {
      const contextValue = actor(context);
      return owned(homeworks.updateSessionNoteOwned(contextValue.trainerId, id.parse(noteId), noteText.parse(note)));
    },
  };
}
