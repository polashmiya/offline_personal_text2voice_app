import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError } from '../../domain/types';

/** User-facing message for an AppError. Raw native details are never shown. */
export function useErrorText() {
  const { t } = useTranslation();
  return useCallback(
    (error: AppError, unsupportedLanguages?: string[]) => {
      if (error.code === 'unsupported_language') {
        const names = (unsupportedLanguages ?? (error.detail ?? '').split(','))
          .filter(Boolean)
          .map(code => (code === 'bn' ? t('languages.nameBn') : t('languages.nameEn')))
          .join(', ');
        return t('errors.unsupported_language', { languages: names });
      }
      return t(`errors.${error.code}`, { defaultValue: t('errors.unknown') });
    },
    [t],
  );
}
