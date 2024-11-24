using Yeen.Services;

namespace Yeen {
    internal class Program {
        static void Main(string[] args) {
            var webAppBuilder = WebApplication.CreateBuilder(args);

            Startup.Configure(webAppBuilder.Configuration);
            Startup.ConfigureServices(webAppBuilder.Services);

            var yeenServerHost = webAppBuilder.Build();

            var setupService = yeenServerHost.Services.GetService<SetupService>();
            setupService.SetupServer();


            yeenServerHost.Run();
        }
    }
}
