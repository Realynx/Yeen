using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.NewFolder {
    public class CoverPhoto {
        [Key]
        public Guid Id { get; set; }

        public byte[] CoverIcon { get; set; }
        public byte[] BannerIcon { get; set; }
    }
}
