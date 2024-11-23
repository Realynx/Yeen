using Microsoft.EntityFrameworkCore;

namespace YeenDatabase.Models {
    public class MediaEntry {
        [PrimaryKey]
        public Guid Id { get; set; }

        public uint WatchCount { get; set; }

        public string FilePath { get; set; }
        public string Checksum { get; set; }

        public MediaMetadata Metadata { get; set; }
        ICollection<CastActor> Cast { get; set; }
    }
}
