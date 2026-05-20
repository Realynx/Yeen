export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}
