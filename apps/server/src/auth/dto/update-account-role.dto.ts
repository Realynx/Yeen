import { IsIn } from 'class-validator';

export class UpdateAccountRoleDto {
  @IsIn(['admin', 'sailer', 'user'])
  role!: 'admin' | 'sailer' | 'user';
}