-- 005_marginal_composite_pk.sql
-- The original PK (timestamp) let a realised merit-order row permanently OVERWRITE
-- the stored forecast-map row for the same half-hour — destroying the prediction
-- before it could ever be scored against the realised value. A composite key lets
-- both coexist, exactly like forecasts' UNIQUE(target_time, model_version), which
-- is what makes honest marginal-forecast accuracy scoring possible later.
ALTER TABLE marginal_intensity DROP CONSTRAINT marginal_intensity_pkey;

ALTER TABLE marginal_intensity ADD PRIMARY KEY (timestamp, method);
