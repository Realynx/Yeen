using System.Diagnostics;
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
            const int BUFFER_SIZE = 4096;
            await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, BUFFER_SIZE);

            const int CHUNK_SIZE = 128 * 1024;
            var length = new FileInfo(filePath).Length;
            await using var stream = new ChunkedStream(fs, BUFFER_SIZE, length > CHUNK_SIZE ? length / CHUNK_SIZE * BUFFER_SIZE : 0);

            using var sha256 = SHA256.Create();

            var sw = Stopwatch.StartNew();
            var hashBytes = await sha256.ComputeHashAsync(stream);
            sw.Stop();

            _logger.Debug($"File Hash: {Convert.ToHexString(hashBytes)} computed in {(double)sw.ElapsedTicks / TimeSpan.TicksPerMillisecond:F3} ms.");
            return hashBytes;
        }
    }
}
