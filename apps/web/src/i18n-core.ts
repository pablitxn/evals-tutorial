import type { Exercise } from '@evals-tutorial/contracts';
import english from './locales/en.json' with { type: 'json' };
import spanish from './locales/es.json' with { type: 'json' };
import lessons from './locales/lessons.es.json' with { type: 'json' };

export type Locale = 'en' | 'es';
export const LOCALE_KEY = 'evals-tutorial:locale';
export const catalogs = { en: english, es: spanish };
export type Parameters = Record<string, string | number>;
export type Message = { key: string; parameters?: Parameters };
export const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'es';

export function initialLocale(storage: Pick<Storage, 'getItem'> | undefined, languages: readonly string[]): Locale {
  try { const saved: unknown = JSON.parse(storage?.getItem(LOCALE_KEY) ?? 'null'); if (isLocale(saved)) return saved; } catch { /* Browser preference remains usable. */ }
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

/** Missing keys fall back to English. Parameter values are rendered as React text. */
export function translate(locale: Locale, key: string, parameters: Parameters = {}): string {
  const en: Record<string, string> = english;
  const selected: Record<string, string> = catalogs[locale];
  const template = (Object.hasOwn(selected, key) ? selected[key] : undefined) ?? (Object.hasOwn(en, key) ? en[key] : undefined) ?? key;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder);
}

/** Presentation-only overlay: never pass this copy to the source/evidence contracts. */
export function localizeLesson(exercise: Exercise, locale: Locale): Pick<Exercise, 'title' | 'lessonMarkdown' | 'criteria'> {
  const overlay = lessons[exercise.id];
  // The verified consultation adapter only replaces Python source and derives
  // a content-bound runtime suffix; the authored prose and rubric remain 1.0.0.
  // Admit only that adapter's exact version shape for this overlay version.
  const runtimePrefix = overlay ? `${overlay.exerciseVersion}-runtime-` : '';
  const adapterVersion = exercise.exerciseVersion.startsWith(runtimePrefix)
    && /^[a-f0-9]{24}$/.test(exercise.exerciseVersion.slice(runtimePrefix.length));
  const samePresentation = overlay && (overlay.exerciseVersion === exercise.exerciseVersion
    || adapterVersion);
  if (locale === 'en' || !samePresentation || overlay.rubricVersion !== exercise.rubricVersion) return exercise;
  const descriptions: Record<string, string> = overlay.criteria;
  // Never mix translated prose with English rubric text when installed content
  // adds, removes, or renames a criterion without a matching overlay update.
  if (exercise.criteria.length !== Object.keys(descriptions).length
    || exercise.criteria.some(criterion => !Object.hasOwn(descriptions, criterion.id))) return exercise;
  return { title: overlay.title, lessonMarkdown: overlay.lessonMarkdown,
    criteria: exercise.criteria.map(criterion => ({ ...criterion, description: descriptions[criterion.id]! })) };
}
