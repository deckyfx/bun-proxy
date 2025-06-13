import status from './status';
import config from './config';
import start from './start';
import stop from './stop';
import toggle from './toggle';
import apply from './apply';
import test from './test';
import driver from './driver';
import log from './log';
import cache from './cache';
import blacklist from './blacklist';
import whitelist from './whitelist';
import metrics from './metrics';

export default {
  ...status,
  ...config,
  ...start,
  ...stop,
  ...toggle,
  ...apply,
  ...test,
  ...driver,
  ...log,
  ...cache,
  ...blacklist,
  ...whitelist,
  ...metrics,
};
