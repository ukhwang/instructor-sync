import type { SeedExercise } from '@/lib/types';

export interface ExerciseRecord extends Omit<SeedExercise, 'category'> {
  category: string;
  exercise_id: string;
  aliases: string[];
  tags: string[];
  equipment: string[];
  content_version: number;
  source_note: string;
  media_url: string | null;
  media_alt: string | null;
  source: 'seed' | 'database';
  status: 'published' | 'draft' | 'archived';
}

export interface ExerciseCatalogProvider {
  load(): Promise<ExerciseRecord[]>;
}

export interface ExerciseCatalog {
  search(query: string, limit?: number): ExerciseRecord[];
  getById(id: string): ExerciseRecord | undefined;
}
