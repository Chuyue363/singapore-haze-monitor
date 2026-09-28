# Methodology notes

PSI and 1-hour PM2.5 are presented as different measures. The interface must not merge them into one label: PSI is used for official air-quality categories and planning guidance, while 1-hour PM2.5 is a short-term concentration reading.

The experimental model uses ordinary least squares with three lag-derived inputs: the previous hour, trailing three-hour mean, and trailing three-hour trend. It models only the latest uninterrupted hourly segment, preventing a missing hour from being treated as an adjacent observation.

Evaluation is chronological: the newest 20% of eligible samples are held out and compared with a persistence baseline. The model is only described as beating persistence when its holdout MAE is lower. It is then refit to all eligible observations for a maximum twelve-hour recursive forecast; the product requests three hours.

The current validation is a single time-ordered split, not a full walk-forward study. The residual range is approximate and does not capture all uncertainty. Weather, wind, rainfall, fire hotspots, and satellite haze have not yet been added. These omissions make the model an educational statistical estimate—not a substitute for NEA's forecast, which considers weather and the regional haze situation.

Next experiments should use rolling-origin evaluation over several haze and non-haze periods. Candidate features should only be retained when they improve out-of-sample error and remain available with aligned observation timestamps.
