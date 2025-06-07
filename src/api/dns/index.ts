import status from './status';
import config from './config';
import start from './start';
import stop from './stop';
import toggle from './toggle';
import test from './test';

export default {
  ...status,
  ...config,
  ...start,
  ...stop,
  ...toggle,
  ...test,
};
