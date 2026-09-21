import { IsOptional, IsInt, Min, IsEnum } from 'class-validator'
import { Type } from 'class-transformer'
import { VideoStatus } from '@prisma/client'

export class GetVideosQueryDto {
	@IsOptional()
	sort?: 'asc' | 'desc'

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	skip?: number

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	take?: number

	@IsOptional()
	@IsEnum(VideoStatus)
	status?: VideoStatus
}
