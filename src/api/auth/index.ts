import signin from './signin';
import signup from './signup';
import logout from './logout';
import refresh from './refresh';

export default {
  ...signin,
  ...signup,
  ...logout,
  ...refresh,
};