using MediaMetadataService.Config;
using MediaMetadataService.Services;
using MediaMetadataService.Services.Interfaces;

using Microsoft.EntityFrameworkCore;

using Yeen.Services;

using YeenDatabase;

using YeenLogging;

namespace Yeen {
    public static class Startup {
        private static readonly IConfiguration _configuration;

        public static void Configure(IConfigurationBuilder configurationBuilder) {
            configurationBuilder
                .AddJsonFile("Appsettings.json")
                .AddJsonFile("Appsettings.dev.json", true)
                .AddEnvironmentVariables();
        }

        public static void ConfigureServices(IServiceCollection serviceDescriptors) {

            serviceDescriptors
                .AddDbContext<YeenDatabaseContext>(options => options.UseSqlite("Data Source=./yeenState.db;Foreign Keys=True;"), ServiceLifetime.Singleton)
                .AddSingleton<LoggerConfig>()
                .AddSingleton<MediaScannerConfig>();

            serviceDescriptors
                .AddSingleton<ILogger, Logger>()
                .AddSingleton<IFileHashingService, FileHashingService>()
                .AddSingleton<MediaDiscoveryService>()
                .AddHostedService<SetupService>();
        }
    }
}
