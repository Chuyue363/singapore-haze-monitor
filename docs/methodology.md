# Methodology notes

PSI and 1-hour PM2.5 are presented as different measures. The interface must not merge them into one label: PSI is used for official air-quality categories and planning guidance, while 1-hour PM2.5 is a short-term concentration reading.

Forecasting work should begin with persistence and rolling-average baselines. Use time-ordered or walk-forward validation to avoid leaking future observations into training data. Report errors and failure cases rather than claiming medical or government-grade prediction accuracy.
