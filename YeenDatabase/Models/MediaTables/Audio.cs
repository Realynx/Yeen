using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.NewFolder {
    public class Audio {
        [Key]
        public Guid Id { get; set; }

        public MediaEntry MediaEntry { get; set; }
        public ICollection<SearchTag> TagCloud { get; set; }
    }
}
