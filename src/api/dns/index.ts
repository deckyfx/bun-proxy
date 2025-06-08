import status from './status';
import config from './config';
import start from './start';
import stop from './stop';
import toggle from './toggle';
import test from './test';
import driver from './driver';

export default {
  ...status,
  ...config,
  ...start,
  ...stop,
  ...toggle,
  ...test,
  ...driver,
};
