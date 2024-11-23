using YeenDatabase;

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
                .AddSqlite<YeenDatabaseContext>("Data Source=yeenState.sqlite;Version=3;");
        }
    }
}
