using System.Security.Cryptography;

using MediaMetadataService.Services.Interfaces;

using YeenLogging;

namespace MediaMetadataService.Services {
    public class FileHashingService : IFileHashingService {
        private readonly ILogger _logger;

        public FileHashingService(ILogger logger) {
            _logger = logger;
        }

        public async Task<byte[]> CalculateSHA256(string filePath) {
            await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 0);

            const int TEN_MEGABYTES = 10 * 1024 * 1024;
            var length = new FileInfo(filePath).Length;
            await using var stream = new NthByteStream(fs, length > TEN_MEGABYTES ? length / TEN_MEGABYTES : 1);

            using var sha256 = SHA256.Create();

            var hashBytes = await sha256.ComputeHashAsync(stream);

            _logger.Debug($"File Hash: {Convert.ToHexString(hashBytes)}");
            return hashBytes;
        }
    }
}
