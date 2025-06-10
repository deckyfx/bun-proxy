import me from './me';
import list from './list';
import create from './create';
import update from './update';
import del from './delete';

export default {
  ...me,
  ...list,
  ...create,
  ...update,
  ...del,
};