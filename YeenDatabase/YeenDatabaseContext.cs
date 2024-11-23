using Microsoft.EntityFrameworkCore;

using YeenDatabase.Models;

namespace YeenDatabase {
    public class YeenDatabaseContext : DbContext {
        public YeenDatabaseContext(DbContextOptions<YeenDatabaseContext> dbContextOptions) {

        }

        public DbSet<MediaEntry> MediaEntries { get; set; }
        public DbSet<MediaMetadata> MetadataEntries { get; set; }
        public DbSet<CastActor> CastActors { get; set; }
    }
}
