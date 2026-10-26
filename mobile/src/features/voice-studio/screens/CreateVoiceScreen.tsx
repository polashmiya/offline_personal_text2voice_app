import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, ChoiceChips, TextField, ToggleRow } from '../../../components/ui/primitives';
import { useErrorText } from '../../../components/common/useErrorText';
import { toAppError } from '../../../services/native/errors';
import { nowIso } from '../../../services/db/database';
import { newId } from '../../../utils/id';
import { studioRepo, type VoiceProject } from '../services/studioRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateVoice'>;
type Gender = NonNullable<VoiceProject['gender']>;

export function CreateVoiceScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [accent, setAccent] = useState('');
  const [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = consent && name.trim().length > 0 && speakerName.trim().length > 0 && !busy;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = newId('vp_');
      await studioRepo.createProject({
        id,
        name: name.trim(),
        speakerName: speakerName.trim(),
        gender,
        accent: accent.trim() || null,
        description: description.trim() || null,
        consentText: t('studio.consentText'),
        consentAt: nowIso(),
      });
      navigation.replace('StudioProject', { projectId: id });
    } catch (e) {
      setError(errorText(toAppError(e)));
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false} keyboardShouldPersistTaps="handled">
      <Card>
        <TextField
          label={t('studio.voiceName')}
          placeholder={t('studio.voiceNamePlaceholder')}
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
        <TextField label={t('studio.speakerName')} value={speakerName} onChangeText={setSpeakerName} maxLength={60} />
        <AppText variant="small" tone="muted">
          {t('studio.gender')}
        </AppText>
        <ChoiceChips<Gender>
          label={t('studio.gender')}
          value={gender}
          onChange={setGender}
          options={[
            { value: 'male', label: t('studio.genderMale') },
            { value: 'female', label: t('studio.genderFemale') },
            { value: 'other', label: t('studio.genderOther') },
          ]}
        />
        <TextField
          label={t('studio.accent')}
          placeholder={t('studio.accentPlaceholder')}
          value={accent}
          onChangeText={setAccent}
          maxLength={60}
        />
        <TextField label={t('studio.description')} value={description} onChangeText={setDescription} maxLength={300} multiline />
      </Card>

      <Card>
        <AppText variant="heading">{t('studio.consentTitle')}</AppText>
        <AppText>{t('studio.consentText')}</AppText>
        <ToggleRow title={t('studio.consentAgree')} value={consent} onChange={setConsent} />
      </Card>

      {error ? <Banner tone="error" text={error} /> : null}
      <Button icon="check" label={t('studio.create')} disabled={!canCreate} loading={busy} onPress={create} />
    </Screen>
  );
}
