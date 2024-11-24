using Microsoft.EntityFrameworkCore;

using Yeen.Services;
using Yeen.Services.Interfaces;

using YeenDatabase;

using YeenLogging;

namespace Yeen {
    public static class Startup {
        private static readonly IConfiguration _configuration;

        public static void Configure(IConfigurationBuilder configurationBuilder) {
            configurationBuilder
                .AddJsonFile("Appsettings.json", false)
                .AddEnvironmentVariables();
        }

        public static void ConfigureServices(IServiceCollection serviceDescriptors) {

            serviceDescriptors
                .AddDbContext<YeenDatabaseContext>(options => options.UseSqlite("Data Source=./yeenState.db;Foreign Keys=True;"), ServiceLifetime.Singleton)
                .AddSingleton<LoggerConfig>();

            serviceDescriptors
                .AddSingleton<YeenLogging.ILogger, Logger>()
                .AddHostedService<SetupService>();
        }
    }
}
