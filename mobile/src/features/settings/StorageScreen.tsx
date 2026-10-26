import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { Button, Card, Divider, ListRow } from '../../components/ui/primitives';
import { showToast } from '../../components/ui/overlays';
import { FileBridge } from '../../services/native';
import { paths } from '../../services/storage/paths';
import { generationsRepo } from '../../services/db/repositories';
import { useGeneration } from '../tts/store/generationStore';
import { formatBytes } from '../../utils/format';

type Usage = { voices: number; generated: number; exports: number; drafts: number; cache: number; free: number };

export function StorageScreen() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);

  const measure = useCallback(async () => {
    const p = paths();
    const [voices, generated, exports, drafts, cache, free] = await Promise.all([
      FileBridge.directorySize(p.voices),
      FileBridge.directorySize(p.generated),
      FileBridge.directorySize(p.exports),
      FileBridge.directorySize(p.drafts),
      FileBridge.directorySize(p.cacheDir),
      FileBridge.freeSpaceBytes(),
    ]);
    setUsage({ voices, generated, exports, drafts, cache, free });
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  const cleanup = async (kind: 'cache' | 'exports' | 'unused') => {
    if (useGeneration.getState().running) {
      return;
    }
    setBusy(true);
    const before = usage;
    const p = paths();
    try {
      if (kind === 'cache') {
        await Promise.all([p.jobs, p.imports, p.staging].map(d => FileBridge.deletePath(d).catch(() => undefined)));
        const files = await FileBridge.listDir(p.cacheDir);
        await Promise.all(files.filter(f => f.name.startsWith('voice-test-')).map(f => FileBridge.deletePath(f.path)));
      } else if (kind === 'exports') {
        await FileBridge.deletePath(p.exports);
      } else {
        // Audio files no history entry points to (e.g. left behind by a crash).
        const referenced = new Set(await generationsRepo.audioPaths());
        const files = (await FileBridge.exists(p.generated)) ? await FileBridge.listDir(p.generated) : [];
        await Promise.all(files.filter(f => !referenced.has(f.path)).map(f => FileBridge.deletePath(f.path)));
      }
      await measure();
    } finally {
      setBusy(false);
    }
    if (before) {
      const after = await FileBridge.directorySize(kind === 'exports' ? p.exports : kind === 'cache' ? p.cacheDir : p.generated);
      const was = kind === 'exports' ? before.exports : kind === 'cache' ? before.cache : before.generated;
      showToast(t('storage.cleaned', { size: formatBytes(Math.max(0, was - after)) }), 'success');
    }
  };

  return (
    <Screen topInset={false}>
      <Card style={styles.list}>
        <ListRow icon="wave" title={t('storage.voices')} right={null} subtitle={usage ? formatBytes(usage.voices) : '…'} />
        <Divider />
        <ListRow icon="music" title={t('storage.generated')} subtitle={usage ? formatBytes(usage.generated) : '…'} />
        <Divider />
        <ListRow icon="download" title={t('storage.exports')} subtitle={usage ? formatBytes(usage.exports) : '…'} />
        <Divider />
        <ListRow icon="fileText" title={t('storage.drafts')} subtitle={usage ? formatBytes(usage.drafts) : '…'} />
        <Divider />
        <ListRow icon="storage" title={t('storage.cache')} subtitle={usage ? formatBytes(usage.cache) : '…'} />
        <Divider />
        <ListRow icon="info" title={t('storage.free')} subtitle={usage ? formatBytes(usage.free) : '…'} />
      </Card>
      <Button kind="secondary" icon="trash" label={t('storage.clearCache')} disabled={busy} onPress={() => cleanup('cache')} />
      <Button kind="secondary" icon="trash" label={t('storage.clearExports')} disabled={busy} onPress={() => cleanup('exports')} />
      <Button kind="secondary" icon="trash" label={t('storage.deleteUnused')} disabled={busy} onPress={() => cleanup('unused')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, gap: 0, overflow: 'hidden' },
});
