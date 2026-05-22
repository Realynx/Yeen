import { IsIn, IsString } from 'class-validator';

export class SetTorrentOrderModeDto {
  @IsString()
  @IsIn(['sequential', 'random'])
  orderMode!: 'sequential' | 'random';
}
