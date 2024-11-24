using Microsoft.EntityFrameworkCore;

using YeenDatabase.Models.NewFolder;
using YeenDatabase.Models.SettingsTables;

namespace YeenDatabase {
    public class YeenDatabaseContext : DbContext {
        public YeenDatabaseContext(DbContextOptions<YeenDatabaseContext> dbContextOptions) : base(dbContextOptions) {
            Database.EnsureCreated();
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder) {
            base.OnModelCreating(modelBuilder);
        }

        public DbSet<SearchTag> SearchTags { get; set; }

        public DbSet<MediaCollection> MediaCollections { get; set; }
        public DbSet<Movie> Movies { get; set; }
        public DbSet<Season> Seasons { get; set; }
        public DbSet<Episode> Episodes { get; set; }
        public DbSet<Audio> Audio { get; set; }


        public DbSet<MediaEntry> MediaEntries { get; set; }
        public DbSet<MediaMetadata> MetadataEntries { get; set; }
        public DbSet<CoverPhoto> CoverPhotos { get; set; }
        public DbSet<CastActor> CastActors { get; set; }

        public DbSet<ServerSettings> ServerSettings { get; set; }
    }
}
