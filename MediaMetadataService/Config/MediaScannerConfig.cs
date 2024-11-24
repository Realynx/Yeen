using Microsoft.Extensions.Configuration;

namespace MediaMetadataService.Config {
    public class MediaScannerConfig {
        public MediaScannerConfig(IConfiguration configuration) {
            configuration.GetSection(nameof(MediaScannerConfig)).Bind(this);
        }

        public MediaDirectory[] MediaDirectories { get; set; }
    }

    public class MediaDirectory {
        public string MediaCategory { get; set; }
        public string DirectoryPath { get; set; }
    }
}
