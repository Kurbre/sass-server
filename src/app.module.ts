import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { BullModule } from '@nestjs/bullmq'
import { AuthModule } from './auth/auth.module'
import { JwtModule } from '@nestjs/jwt'
import { jwtConfig } from './config/jwt.config'
import { bullModuleConfig } from './config/bull-module.config'
import { RedisModule } from './redis/redis.module'
import { AccountsModule } from './accounts/accounts.module'
import { BrowserModule } from './browser/browser.module'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import { VideosModule } from './videos/videos.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import appRoot from 'app-root-path'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true
		}),
		BullModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: bullModuleConfig
		}),
		ServeStaticModule.forRoot({
			rootPath: join(process.cwd(), 'tmp')
		}),
		PrismaModule,
		UsersModule,
		AuthModule,
		RedisModule,
		AccountsModule,
		BrowserModule,
		VideosModule,
		CloudinaryModule
	],
	controllers: [],
	providers: []
})
export class AppModule {}
