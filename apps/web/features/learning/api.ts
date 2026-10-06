'use client';
import { useApi } from '../../shared/hooks/use-api';
import { useApp } from '../../shared/session/providers';
import { learningAr, learningEn } from './messages';

export function useLearningApi() {
  const api = useApi();
  const { locale } = useApp();
  return { ...api, t: locale === 'ar' ? learningAr : learningEn };
}
