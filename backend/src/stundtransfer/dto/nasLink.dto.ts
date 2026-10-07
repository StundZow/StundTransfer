// StundTransfer: links to files already on the NAS.
import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class CreateNasLinkDTO {
  // File relative to the mounted folder
  @IsString()
  @Length(1, 4096)
  path: string;

  // No expiry when missing
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
