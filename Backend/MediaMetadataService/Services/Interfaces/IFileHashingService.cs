namespace MediaMetadataService.Services.Interfaces {
    public interface IFileHashingService {
        Task<byte[]> CalculateSHA256(string filePath);
    }
}