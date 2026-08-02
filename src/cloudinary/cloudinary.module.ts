import { Module } from '@nestjs/common'
import { CloudinaryService } from './cloudinary.service'
import { v2 as cloudinary } from 'cloudinary'
import { ConfigService } from '@nestjs/config'

export const CLOUDINARY_PROVIDER = 'CLOUDINARY'

@Module({
	providers: [
		CloudinaryService,
		{
			provide: CLOUDINARY_PROVIDER,
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) =>
				cloudinary.config({
					cloud_name: configService.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
					api_key: configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
					api_secret: configService.getOrThrow<string>('CLOUDINARY_API_SECRET')
				})
		}
	],
	exports: [CloudinaryService]
})
export class CloudinaryModule {}
