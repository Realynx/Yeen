using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models {
    public class Movie {
        [Key]
        public Guid Id { get; set; }

        public MediaEntry SourceMediaEntry { get; set; }
        ICollection<CastActor> Cast { get; set; }
        ICollection<SearchTag> TagCloud { get; set; }
    }
}
