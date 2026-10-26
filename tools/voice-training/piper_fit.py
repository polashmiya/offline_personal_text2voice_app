#!/usr/bin/env python3
"""
`python -m piper.train` with one fix, used by train.py.

piper1-gpl v1.8.0 keeps a second checkpoint callback that monitors "val_mos" (a UTMOS quality
score). When the UTMOS model cannot be loaded (no network, Windows, ...) the score is never
logged, and current Lightning versions then *raise* instead of skipping, killing the run at
the end of the first epoch. This wrapper makes that callback skip quietly when the score is
missing; the val_mel and last.ckpt checkpoints are unaffected.
"""

import piper.train.__main__ as piper_main
from lightning.pytorch.callbacks import ModelCheckpoint


class OptionalMetricCheckpoint(ModelCheckpoint):
    """Saves top-k checkpoints only when its metric was actually logged."""

    def _save_topk_checkpoint(self, trainer, monitor_candidates):
        if self.monitor is not None and self.monitor not in monitor_candidates:
            return
        super()._save_topk_checkpoint(trainer, monitor_candidates)


for i, callback in enumerate(piper_main._DEFAULT_CALLBACKS):
    if isinstance(callback, ModelCheckpoint) and callback.monitor == "val_mos":
        piper_main._DEFAULT_CALLBACKS[i] = OptionalMetricCheckpoint(
            monitor="val_mos",
            mode="max",
            save_top_k=5,
            save_last=False,
            filename="epoch={epoch}-val_mos={val_mos:.4f}",
            auto_insert_metric_name=False,
        )

if __name__ == "__main__":
    piper_main.main()
