using System.Diagnostics.Metrics;

using MediaMetadataService.Services.Interfaces;

using Microsoft.EntityFrameworkCore;

using YeenDatabase;
using YeenDatabase.Models.NewFolder;

using YeenLogging;

namespace MediaMetadataService.Services {
    public class MediaDiscoveryService {
        private readonly ILogger _logger;
        private readonly YeenDatabaseContext _dbContext;
        private readonly IFileHashingService _fileHashingService;

        private readonly string[] _videoFormats = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".mpeg", ".mpg", ".3gp"];
        private readonly string[] _musicFormats = [".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".wma", ".aiff", ".alac"];

        public MediaDiscoveryService(ILogger logger, YeenDatabaseContext dbContext, IFileHashingService fileHashingService) {
            _logger = logger;
            _dbContext = dbContext;
            _fileHashingService = fileHashingService;
        }

        public async Task ScanMediaDirectory(string directoryPath) {
            if (!Directory.Exists(directoryPath)) {
                _logger.Error($"Media path does not exist \"{directoryPath}\"");
                return;
            }

            _logger.Info($"Starting media scan [{directoryPath}]");

            var directoryInfo = new DirectoryInfo(directoryPath);
            var allSubFiles = directoryInfo.EnumerateFiles("*.*", SearchOption.AllDirectories).ToArray();

            var allvideoFiles = allSubFiles.Where(i => _videoFormats.Contains(i.Extension, StringComparer.OrdinalIgnoreCase)).ToArray();
            var allmusicFiles = allSubFiles.Where(i => _musicFormats.Contains(i.Extension, StringComparer.OrdinalIgnoreCase)).ToArray();
            _logger.Info($"Found {allvideoFiles.Length} video files. Found {allmusicFiles.Length} music files.");

            _logger.Debug($"Updating database with media entries");
            await UpdateOrAddVideoMedia(allvideoFiles);
        }

        private async Task UpdateOrAddVideoMedia(FileInfo[] videoFiles) {
            int added = 0, updated = 0;

            foreach (var videoFile in videoFiles) {
                var fileHash = await _fileHashingService.CalculateSHA256(videoFile.FullName);

                if (_dbContext.MediaEntries.FirstOrDefault(i => i.FilePath == videoFile.FullName) is MediaEntry existingEntry) {
                    existingEntry.Checksum = fileHash;

                    _dbContext.MediaEntries.Update(existingEntry);
                    await _dbContext.SaveChangesAsync();

                    updated++;
                    continue;
                }

                var mediaEntry = new MediaEntry() {
                    FilePath = videoFile.FullName,
                    Checksum = fileHash
                };

                _dbContext.MediaEntries.Add(mediaEntry);
                await _dbContext.SaveChangesAsync();

                added++;
            }
            _logger.Info($"Updated {updated} files, Added {added} new files.");
        }
    }
}
