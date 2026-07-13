import { AHS } from '../../utils'

const API_USER = {
  'USER.getProfile': {
    url: 'https://www.luogu.com.cn/user/<%= uid %>',
    _fetch: { method: 'GET' },
    afterHandle: AHS.J_D,
  },
  'USER.getSubmittedProblems': {
    url: 'https://www.luogu.com.cn/record/list',
    _fetch: { method: 'GET' },
    params: {
      user: '<%= uid %>',
      page: 1,
    },
    afterHandle: AHS.J_D,
  },
  'USER.getBlogs': {
    url: 'https://www.luogu.com.cn/blog/<%= uid %>',
    _fetch: { method: 'GET' },
    afterHandle: AHS.J_D,
  },
  'USER.getFollowing': {
    url: 'https://www.luogu.com.cn/user/<%= uid %>/following',
    _fetch: { method: 'GET' },
    afterHandle: AHS.J_D,
  },
  'USER.getFollowers': {
    url: 'https://www.luogu.com.cn/user/<%= uid %>/followers',
    _fetch: { method: 'GET' },
    afterHandle: AHS.J_D,
  },
}

export default API_USER
