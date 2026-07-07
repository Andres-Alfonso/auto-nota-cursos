import { Type } from "class-transformer";
import { IsNotEmpty } from "class-validator";

// dto/upload-users-clubs.dto.ts
export class UploadUsersClubsDto {
  @IsNotEmpty()
  @Type(() => Number)
  clientId?: string;
}