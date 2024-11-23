using YeenDatabase;

using YeenLogging;

namespace MediaMetadataService.Services {
    public class MediaDiscoveryService {
        private readonly ILogger _logger;
        private readonly YeenDatabaseContext _dbContext;

        private readonly string[] _videoFormats = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".mpeg", ".mpg", ".3gp"];
        private readonly string[] _musicFormats = [".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".wma", ".aiff", ".alac"];

        public MediaDiscoveryService(ILogger logger, YeenDatabaseContext dbContext) {
            _logger = logger;
            _dbContext = dbContext;
        }

        public async Task ScanMediaDirectory(string directoryPath) {
            if (!Directory.Exists(directoryPath)) {
                _logger.Error($"Media path does not exist \"{directoryPath}\"");
                return;
            }

            _logger.Info($"Starting media scan [{directoryPath}]");

            var directoryInfo = new DirectoryInfo(directoryPath);
            var allSubFiles = directoryInfo.EnumerateFiles("*.*", SearchOption.AllDirectories);

            var allvideoFiles = allSubFiles.Where(i => _videoFormats.Contains(i.Extension, StringComparer.OrdinalIgnoreCase)).ToArray();
            var allmusicFiles = allSubFiles.Where(i => _musicFormats.Contains(i.Extension, StringComparer.OrdinalIgnoreCase)).ToArray();

            _logger.Info($"Found {allvideoFiles.Length} video files. Found {allmusicFiles.Length} music files.");

            _logger.Debug($"Updating database with media entries");
        }
    }
}
