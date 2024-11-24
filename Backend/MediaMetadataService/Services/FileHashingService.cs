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
            await using var stream = new NthByteStream(fs, 10);
            using var md5 = MD5.Create();

            var hashBytes = await md5.ComputeHashAsync(stream);

            _logger.Debug($"File Hash: {Convert.ToHexString(hashBytes)}");
            return hashBytes;
        }
    }
}
