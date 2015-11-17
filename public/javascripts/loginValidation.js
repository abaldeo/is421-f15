$.validator.setDefaults( {
    submitHandler: function (form) {
        form.submit();
    }
} );
$( document ).ready( function () {
    $( "#login" ).validate( {
        rules: {
            password:"required",
            username:{
                required:true,
                minlength: 2

            }
        },
        messages: {
            username: {
                required: "Please enter a username"
            },
            password: {
                required: "Please provide a password"
            }
        },
        errorElement: "em",
        errorPlacement: function ( error, element ) {
            // Add the `help-block` class to the error element
            error.addClass( "help-block" );
            if ( element.prop( "type" ) === "checkbox" ) {
                error.insertAfter( element.parent( "label" ) );
            } else {
                error.insertAfter( element );
            }
        },
        highlight: function ( element, errorClass, validClass ) {
            $( element ).parents( ".col-md-10" ).addClass( "has-error" ).removeClass( "has-success" );
        },
        unhighlight: function (element, errorClass, validClass) {
            $( element ).parents( ".col-md-10" ).addClass( "has-success" ).removeClass( "has-error" );
        }
    });

});

