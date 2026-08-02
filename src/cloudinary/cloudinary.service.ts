import { Injectable } from '@nestjs/common'
import {
	v2 as cloudinary,
	UploadApiErrorResponse,
	UploadApiResponse
} from 'cloudinary'
import 'multer'

@Injectable()
export class CloudinaryService {
	async uploadFile(
		file: Express.Multer.File
	): Promise<UploadApiResponse | UploadApiErrorResponse | undefined> {
		return new Promise((resolve, reject) => {
			const uploadStream = cloudinary.uploader.upload_stream(
				{
					folder: 'nestjs_uploads',
					resource_type: 'video'
				},
				(error, result) => {
					if (error) return reject(error)
					resolve(result)
				}
			)

			// Передаем буфер файла в поток загрузки
			uploadStream.end(file.buffer)
		})
	}
}
