using System.Security.Principal;

using Microsoft.EntityFrameworkCore;

namespace YeenDatabase.Models {
    public class MediaMetadata {
        [PrimaryKey]
        public Guid Id { get; set; }

        public string Title { get; set; }

        public bool Series { get; set; }
        public int Season { get; set; }
        public int Episode { get; set; }

        public int Rating { get; set; }
        public string Genre { get; set; }
        public string Description { get; set; }
        public int ReleaseYear { get; set; }
        public string CoverIcon { get; set; }
        public string BannerIcon { get; set; }
    }
}
