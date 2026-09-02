import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import { AccountsModule } from './accounts/accounts.module'
import { AuthModule } from './auth/auth.module'
import { TiktokModule } from './tiktok/tiktok.module'
import { bullModuleConfig } from './config/bull-module.config'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { UsersModule } from './users/users.module'
import { VideosModule } from './videos/videos.module'
import { EventsModule } from './events/events.module'
import { CronTasksModule } from './cron-tasks/cron-tasks.module'
import { NotificationsModule } from './notifications/notifications.module'
import { TiktokStatsModule } from './tiktok-stats/tiktok-stats.module';

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
		TiktokModule,
		VideosModule,
		EventsModule,
		CronTasksModule,
		NotificationsModule,
		TiktokStatsModule
	],
	controllers: [],
	providers: []
})
export class AppModule {}
